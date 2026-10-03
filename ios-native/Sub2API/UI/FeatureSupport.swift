import SwiftUI
import UniformTypeIdentifiers

struct JSONFileDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json, .plainText] }
    var data: Data

    init(data: Data = Data("{}".utf8)) { self.data = data }
    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else { throw CocoaError(.fileReadCorruptFile) }
        self.data = data
    }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}

enum FormParsing {
    static func number(_ raw: String) throws -> Double? {
        guard !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        guard let value = Double(raw) else { throw ValidationError("数值格式不正确：\(raw)") }
        return value
    }

    static func integer(_ raw: String) throws -> Int? {
        guard !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        guard let value = Int(raw) else { throw ValidationError("整数格式不正确：\(raw)") }
        return value
    }

    static func integerList(_ raw: String) throws -> [Int]? {
        guard !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        let values = raw.split(separator: ",").compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }
        guard !values.isEmpty else { throw ValidationError("ID 列表格式不正确。") }
        return Array(Set(values)).sorted()
    }

    static func jsonObject(_ raw: String) throws -> [String: JSONValue] {
        guard !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return [:] }
        let data = Data(raw.utf8)
        return try JSONDecoder().decode([String: JSONValue].self, from: data)
    }

    static func jsonValue(_ data: Data) throws -> JSONValue { try JSONDecoder().decode(JSONValue.self, from: data) }
    static func jsonData(_ value: JSONValue) throws -> Data {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        return try encoder.encode(value)
    }
}

struct ValidationError: LocalizedError, Sendable {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

struct LabeledValueRow: View {
    let label: String
    let value: String
    var tint: Color = .primary

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Spacer()
            Text(value).font(.subheadline.weight(.medium)).foregroundStyle(tint).multilineTextAlignment(.trailing).textSelection(.enabled)
        }
    }
}

struct ActionGridButton: View {
    let title: String
    let symbol: String
    var tint: Color = AppPalette.blue
    var destructive = false
    let action: () -> Void

    var body: some View {
        Button(role: destructive ? .destructive : nil, action: action) {
            VStack(spacing: 7) {
                Image(systemName: symbol).font(.title3)
                Text(title).font(.caption.weight(.semibold)).lineLimit(2).multilineTextAlignment(.center)
            }
            .foregroundStyle(destructive ? Color.red : tint)
            .frame(maxWidth: .infinity, minHeight: 62)
        }
        .buttonStyle(.bordered)
    }
}

enum TimeRange: Int, CaseIterable, Identifiable {
    case day = 1, week = 7, month = 30
    var id: Int { rawValue }
    var label: String { self == .day ? "24H" : "\(rawValue)D" }
    var startEnd: (String, String) {
        let now = Date(); let start = Calendar.current.date(byAdding: .day, value: -(rawValue - 1), to: now) ?? now
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM-dd"
        return (formatter.string(from: start), formatter.string(from: now))
    }
    var granularity: String { self == .day ? "hour" : "day" }
}

extension String {
    var nilIfBlank: String? {
        let value = trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
}
