import Foundation

enum HTTPMethod: String, Sendable {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case delete = "DELETE"
}

enum APIError: LocalizedError, Sendable {
    case invalidBaseURL
    case invalidResponse
    case server(status: Int, message: String)
    case decoding(String)

    var errorDescription: String? {
        switch self {
        case .invalidBaseURL:
            return "服务器地址无效。"
        case .invalidResponse:
            return "服务器返回了无法识别的数据。"
        case let .server(_, message):
            return message
        case let .decoding(message):
            return "数据解析失败：\(message)"
        }
    }
}

struct APIClient: Sendable {
    let baseURL: String
    let adminKey: String
    var session: URLSession = .shared

    func get<T: Decodable & Sendable>(
        _ path: String,
        query: [URLQueryItem] = [],
        as type: T.Type = T.self
    ) async throws -> T {
        try await request(path, method: .get, query: query, body: nil, as: type)
    }

    func send<T: Decodable & Sendable, Body: Encodable & Sendable>(
        _ path: String,
        method: HTTPMethod,
        query: [URLQueryItem] = [],
        body: Body,
        idempotencyKey: String? = nil,
        as type: T.Type = T.self
    ) async throws -> T {
        let data = try JSONEncoder().encode(body)
        return try await request(path, method: method, query: query, body: data, idempotencyKey: idempotencyKey, as: type)
    }

    func send<T: Decodable & Sendable>(
        _ path: String,
        method: HTTPMethod,
        query: [URLQueryItem] = [],
        idempotencyKey: String? = nil,
        as type: T.Type = T.self
    ) async throws -> T {
        try await request(path, method: method, query: query, body: nil, idempotencyKey: idempotencyKey, as: type)
    }

    private func request<T: Decodable & Sendable>(
        _ path: String,
        method: HTTPMethod,
        query: [URLQueryItem],
        body: Data?,
        idempotencyKey: String? = nil,
        as type: T.Type
    ) async throws -> T {
        let url = try makeURL(path: path, query: query)
        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.httpBody = body
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let token = stripBearer(adminKey)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if !isJWT(token) {
            request.setValue(token, forHTTPHeaderField: "x-api-key")
        }
        if let idempotencyKey {
            request.setValue(idempotencyKey, forHTTPHeaderField: "Idempotency-Key")
        }

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }

        if data.isEmpty {
            guard (200..<300).contains(http.statusCode) else {
                throw APIError.server(status: http.statusCode, message: "请求失败（HTTP \(http.statusCode)）。")
            }
            if T.self == EmptyResponse.self { return EmptyResponse() as! T }
            throw APIError.invalidResponse
        }

        let object = try? JSONSerialization.jsonObject(with: data)
        if object == nil, (200..<300).contains(http.statusCode), T.self == EmptyResponse.self {
            return EmptyResponse() as! T
        }
        if let dictionary = object as? [String: Any] {
            if let code = dictionary["code"] as? Int {
                let codeOK = code == 0 || (200..<300).contains(code)
                guard (200..<300).contains(http.statusCode), codeOK else {
                    throw APIError.server(status: http.statusCode, message: errorMessage(in: dictionary))
                }
                return try decodePayload(dictionary["data"], original: data, as: type)
            }
            if let success = dictionary["success"] as? Bool {
                guard (200..<300).contains(http.statusCode), success else {
                    throw APIError.server(status: http.statusCode, message: errorMessage(in: dictionary))
                }
                return try decodePayload(dictionary["data"] ?? dictionary, original: data, as: type)
            }
            guard (200..<300).contains(http.statusCode) else {
                throw APIError.server(status: http.statusCode, message: errorMessage(in: dictionary))
            }
        } else if !(200..<300).contains(http.statusCode) {
            let text = String(data: data, encoding: .utf8) ?? "请求失败"
            throw APIError.server(status: http.statusCode, message: String(text.prefix(180)))
        }

        return try decode(data, as: type)
    }

    private func decodePayload<T: Decodable & Sendable>(_ payload: Any?, original: Data, as type: T.Type) throws -> T {
        guard let payload, !(payload is NSNull) else {
            if T.self == EmptyResponse.self { return EmptyResponse() as! T }
            return try decode(original, as: type)
        }
        let payloadData = try JSONSerialization.data(withJSONObject: payload)
        return try decode(payloadData, as: type)
    }

    private func decode<T: Decodable & Sendable>(_ data: Data, as type: T.Type) throws -> T {
        do {
            return try JSONDecoder().decode(type, from: data)
        } catch {
            throw APIError.decoding(error.localizedDescription)
        }
    }

    private func makeURL(path: String, query: [URLQueryItem]) throws -> URL {
        var normalizedBase = baseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        while normalizedBase.hasSuffix("/") { normalizedBase.removeLast() }
        var normalizedPath = path.hasPrefix("/") ? path : "/\(path)"

        for prefix in ["/api/v1", "/api"] where normalizedBase.hasSuffix(prefix) && normalizedPath.hasPrefix("\(prefix)/") {
            normalizedBase.removeLast(prefix.count)
            break
        }

        guard var components = URLComponents(string: normalizedBase + normalizedPath) else {
            throw APIError.invalidBaseURL
        }
        if !query.isEmpty { components.queryItems = query }
        guard let url = components.url else { throw APIError.invalidBaseURL }
        return url
    }

    private func stripBearer(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.lowercased().hasPrefix("bearer ") {
            return String(trimmed.dropFirst(7)).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return trimmed
    }

    private func isJWT(_ value: String) -> Bool {
        let parts = value.split(separator: ".")
        guard parts.count == 3 else { return false }
        return parts.allSatisfy { !$0.isEmpty && $0.allSatisfy { $0.isLetter || $0.isNumber || $0 == "_" || $0 == "-" } }
    }

    private func errorMessage(in dictionary: [String: Any]) -> String {
        for key in ["reason", "message", "detail", "error"] {
            if let message = dictionary[key] as? String, !message.isEmpty { return message }
        }
        return "请求失败，请检查服务地址和 Admin Key。"
    }
}

extension APIClient {
    func listPage<T: Decodable & Sendable>(
        _ path: String,
        query: [URLQueryItem] = [],
        itemKeys: [String]
    ) async throws -> Page<T> {
        let url = try makePublicURL(path: path, query: query)
        var request = URLRequest(url: url)
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let token = adminKey.lowercased().hasPrefix("bearer ") ? String(adminKey.dropFirst(7)).trimmingCharacters(in: .whitespaces) : adminKey
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if token.split(separator: ".").count != 3 { request.setValue(token, forHTTPHeaderField: "x-api-key") }

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw APIError.invalidResponse
        }
        let object = try JSONSerialization.jsonObject(with: data)
        let unwrapped: Any
        if let dict = object as? [String: Any], let envelopeData = dict["data"] { unwrapped = envelopeData } else { unwrapped = object }

        if let dict = unwrapped as? [String: Any] {
            for key in itemKeys {
                if let items = dict[key] as? [Any] {
                    let itemData = try JSONSerialization.data(withJSONObject: items)
                    let decoded = try JSONDecoder().decode([T].self, from: itemData)
                    return Page(
                        items: decoded,
                        total: dict["total"] as? Int,
                        page: dict["page"] as? Int ?? 1,
                        pageSize: dict["page_size"] as? Int,
                        pages: dict["pages"] as? Int ?? 1
                    )
                }
            }
        }
        if let items = unwrapped as? [Any] {
            let itemData = try JSONSerialization.data(withJSONObject: items)
            return Page(items: try JSONDecoder().decode([T].self, from: itemData))
        }
        throw APIError.invalidResponse
    }

    private func makePublicURL(path: String, query: [URLQueryItem]) throws -> URL {
        var normalizedBase = baseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        while normalizedBase.hasSuffix("/") { normalizedBase.removeLast() }
        var normalizedPath = path.hasPrefix("/") ? path : "/\(path)"
        for prefix in ["/api/v1", "/api"] where normalizedBase.hasSuffix(prefix) && normalizedPath.hasPrefix("\(prefix)/") {
            normalizedBase.removeLast(prefix.count)
            break
        }
        guard var components = URLComponents(string: normalizedBase + normalizedPath) else { throw APIError.invalidBaseURL }
        components.queryItems = query.isEmpty ? nil : query
        guard let url = components.url else { throw APIError.invalidBaseURL }
        return url
    }
}

extension URLQueryItem {
    static func item(_ name: String, _ value: String?) -> URLQueryItem? {
        guard let value, !value.isEmpty else { return nil }
        return URLQueryItem(name: name, value: value)
    }
}

