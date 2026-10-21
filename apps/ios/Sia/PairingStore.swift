import Foundation
import Security

/// Keeps the pairing in the iOS Keychain, on this device only (never synced or backed up to
/// another device), readable after the first unlock so the app opens straight into Sia.
struct PairingStore {
    static let shared = PairingStore()
    let service: String

    init(service: String = "ai.sia.phone.pairing") { self.service = service }
    private let account = "relay"

    private var query: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    func load() -> Pairing? {
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(request as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data
        else { return nil }
        return try? JSONDecoder().decode(Pairing.self, from: data)
    }

    @discardableResult
    func save(_ pairing: Pairing) -> Bool {
        guard let data = try? JSONEncoder().encode(pairing) else { return false }
        let changes = [kSecValueData as String: data]
        let updated = SecItemUpdate(query as CFDictionary, changes as CFDictionary)
        if updated == errSecSuccess { return true }
        guard updated == errSecItemNotFound else { return false }
        var item = query
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(item as CFDictionary, nil) == errSecSuccess
    }

    func clear() {
        SecItemDelete(query as CFDictionary)
    }
}
