import SwiftUI

enum AppPalette {
    static let teal = Color(red: 0.05, green: 0.45, blue: 0.39)
    static let blue = Color(red: 0.12, green: 0.38, blue: 0.88)
    static let orange = Color(red: 0.91, green: 0.36, blue: 0.13)
    static let purple = Color(red: 0.48, green: 0.28, blue: 0.78)
    static let background = Color(uiColor: .systemGroupedBackground)
}

extension View {
    @ViewBuilder
    func glassPanel(cornerRadius: CGFloat = 20, interactive: Bool = false) -> some View {
        if #available(iOS 26.0, *) {
            if interactive {
                self.glassEffect(.regular.interactive(), in: .rect(cornerRadius: cornerRadius))
            } else {
                self.glassEffect(.regular, in: .rect(cornerRadius: cornerRadius))
            }
        } else {
            self
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .stroke(.primary.opacity(0.08), lineWidth: 0.5)
                }
        }
    }

    func appPage() -> some View {
        background(AppPalette.background.ignoresSafeArea())
    }
}

struct PageHeader: View {
    let title: String
    let subtitle: String
    let symbol: String
    var tint: Color = AppPalette.teal
    var action: (() -> Void)?
    var actionSymbol: String = "plus"

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 42, height: 42)
                .glassPanel(cornerRadius: 14)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.title.bold())
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Text(subtitle)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            Spacer(minLength: 8)
            if let action {
                Button(action: action) {
                    Image(systemName: actionSymbol)
                        .font(.system(size: 17, weight: .bold))
                        .frame(width: 40, height: 40)
                }
                .buttonStyle(GlassIconButtonStyle(tint: tint))
                .accessibilityLabel(actionSymbol == "plus" ? "添加" : "操作")
            }
        }
    }
}

struct MetricTile: View {
    let label: String
    let value: String
    let symbol: String
    var tint: Color = AppPalette.teal

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: symbol)
                    .foregroundStyle(tint)
                    .frame(width: 24, height: 24)
                    .background(tint.opacity(0.11), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                Text(label)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            .font(.caption)

            Text(value)
                .font(.system(.title2, design: .rounded, weight: .bold))
                .contentTransition(.numericText())
                .lineLimit(1)
                .minimumScaleFactor(0.65)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .glassPanel(cornerRadius: 18)
    }
}

struct StatusPill: View {
    let text: String
    let color: Color

    var body: some View {
        HStack(spacing: 5) {
            Circle().fill(color).frame(width: 6, height: 6)
            Text(text)
                .lineLimit(1)
        }
        .font(.caption2.weight(.semibold))
        .foregroundStyle(color)
        .padding(.horizontal, 9)
        .padding(.vertical, 6)
        .background(color.opacity(0.11), in: Capsule())
    }
}

struct InlineErrorView: View {
    let message: String
    var retry: (() -> Void)?

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.title2)
                .foregroundStyle(AppPalette.orange)
            Text(message)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            if let retry {
                Button("重试", action: retry)
                    .buttonStyle(.borderedProminent)
                    .tint(AppPalette.teal)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(24)
        .glassPanel()
    }
}

struct EmptyContentView: View {
    let symbol: String
    let title: String
    let message: String

    var body: some View {
        ContentUnavailableView(title, systemImage: symbol, description: Text(message))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 22)
            .glassPanel()
    }
}

struct GlassIconButtonStyle: ButtonStyle {
    var tint: Color = AppPalette.teal

    @ViewBuilder
    func makeBody(configuration: Configuration) -> some View {
        if #available(iOS 26.0, *) {
            configuration.label
                .foregroundStyle(tint)
                .glassEffect(.regular.interactive(), in: .circle)
                .scaleEffect(configuration.isPressed ? 0.94 : 1)
        } else {
            configuration.label
                .foregroundStyle(tint)
                .background(.regularMaterial, in: Circle())
                .overlay(Circle().stroke(.primary.opacity(0.08), lineWidth: 0.5))
                .scaleEffect(configuration.isPressed ? 0.94 : 1)
        }
    }
}

struct LoadingView: View {
    var label = "正在加载"

    var body: some View {
        VStack(spacing: 12) {
            ProgressView().tint(AppPalette.teal)
            Text(label).font(.footnote).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(28)
        .glassPanel()
    }
}

enum StatusStyle {
    static func account(_ account: AdminAccount) -> (String, Color) {
        let normalized = (account.status ?? "active").lowercased()
        let extra = account.extra?.objectValue ?? [:]
        if isRateLimited(account, extra: extra) { return ("限流", .gray) }
        if normalized == "error" || account.error?.isEmpty == false || account.errorMessage?.isEmpty == false { return ("异常", AppPalette.orange) }
        let extraPause = extra.text("temp_unschedulable_until", "tempUnschedulableUntil")
        if ["disabled", "inactive", "paused", "stop", "stopped"].contains(normalized)
            || account.schedulable == false
            || isFuture(account.tempUnschedulableUntil)
            || isFuture(extraPause) { return ("暂停", .secondary) }
        return ("正常", .green)
    }

    private static func isRateLimited(_ account: AdminAccount, extra: [String: JSONValue]) -> Bool {
        if let explicit = account.isRateLimited { return explicit }
        for key in ["is_rate_limited", "isRateLimited", "rate_limited", "rateLimited"] {
            if let explicit = explicitBoolean(extra[key]) { return explicit }
        }
        let rateStatuses = Set(["rate_limited", "rate-limited", "rate_limit", "limited", "throttled", "too_many_requests"])
        if rateStatuses.contains((account.status ?? "").lowercased()) || rateStatuses.contains(extra.text("status", "state")?.lowercased() ?? "") { return true }
        if account.errorCode == 429 || extra.number("error_code", "errorCode", "status_code", "statusCode") == 429 { return true }
        if activeRateLimit(resetAt: account.rateLimitResetAt, limitedAt: account.rateLimitedAt, message: account.errorMessage ?? account.error) { return true }
        if activeRateLimit(resetAt: extra.text("rate_limit_reset_at", "rateLimitResetAt"), limitedAt: extra.text("rate_limited_at", "rateLimitedAt"), message: extra.text("error_message", "errorMessage", "message", "reason")) { return true }
        if let modelLimits = extra["model_rate_limits"]?.objectValue ?? extra["modelRateLimits"]?.objectValue {
            for value in modelLimits.values {
                guard let row = value.objectValue else { continue }
                var modelExplicit: Bool?
                for key in ["is_rate_limited", "isRateLimited", "rate_limited", "rateLimited"] {
                    if let state = explicitBoolean(row[key]) { modelExplicit = state; break }
                }
                if modelExplicit == true { return true }
                if modelExplicit == false { continue }
                if rateStatuses.contains(row.text("status", "state")?.lowercased() ?? "") { return true }
                if activeRateLimit(resetAt: row.text("rate_limit_reset_at", "rateLimitResetAt"), limitedAt: row.text("rate_limited_at", "rateLimitedAt"), message: row.text("error_message", "errorMessage", "message", "reason")) { return true }
            }
        }
        return false
    }

    private static func explicitBoolean(_ value: JSONValue?) -> Bool? {
        guard let value else { return nil }
        switch value {
        case let .bool(bool): return bool
        case let .number(number): return number != 0
        case let .string(raw):
            let text = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if ["true", "1", "yes", "limited", "rate_limited", "throttled"].contains(text) { return true }
            if ["false", "0", "no", "normal", "available", "none"].contains(text) { return false }
            return nil
        default: return nil
        }
    }

    private static func activeRateLimit(resetAt: String?, limitedAt: String?, message: String?) -> Bool {
        guard let resetAt, let reset = parsedDate(resetAt), reset > Date() else { return false }
        let signal = (message ?? "").lowercased()
        let hasSignal = signal.contains("rate limit") || signal.contains("rate_limit") || signal.contains("429") || signal.contains("限流")
        if let limitedAt, let limited = parsedDate(limitedAt), limited <= Date() { return true }
        return hasSignal
    }

    private static func isFuture(_ value: String?) -> Bool { value.flatMap(parsedDate).map { $0 > Date() } ?? false }
    private static func parsedDate(_ value: String) -> Date? {
        if let seconds = Double(value) { return Date(timeIntervalSince1970: seconds > 10_000_000_000 ? seconds / 1_000 : seconds) }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    static func generic(_ status: String?) -> (String, Color) {
        let normalized = (status ?? "active").lowercased()
        if ["active", "enabled", "normal", "ok"].contains(normalized) { return ("启用", .green) }
        if ["error", "failed", "firing"].contains(normalized) { return ("异常", AppPalette.orange) }
        if ["inactive", "disabled", "revoked"].contains(normalized) { return ("停用", .secondary) }
        return (status ?? "未知", .secondary)
    }
}

