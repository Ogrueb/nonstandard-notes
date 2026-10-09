package com.standardnotes;

import java.net.URI;
import java.util.Locale;

/**
 * Offline build: the same host allowlist as the web app's OfflineAllowlist.ts, applied to every
 * request the WebView makes itself (images, stylesheets, iframes) as well as fetch/XHR.
 * Plain Java (no Android classes) so it can be unit-tested anywhere.
 *
 * Always allowed: non-network schemes (file:, data:, blob:, about:, ...), localhost and loopback,
 * private IPv4 (10/8, 172.16/12, 192.168/16), link-local (169.254/16), Tailscale/CGNAT (100.64/10),
 * IPv6 loopback, unique-local (fc00::/7), link-local (fe80::/10) and IPv4-mapped private addresses,
 * and local-only names (.local, .lan, .home.arpa, .internal, .localhost).
 *
 * Network isolation on (the default): everything else is blocked.
 * Network isolation off: other internet hosts are allowed too, except Standard Notes' own domains
 * (standardnotes.com, standardnotes.org, listed.to and their subdomains), which stay blocked.
 */
public final class OfflineAllowlist {
    private static final String[] LOCAL_SUFFIXES = {".localhost", ".local", ".lan", ".home.arpa", ".internal"};

    /** Standard Notes' own domains: blocked in both modes */
    private static final String[] STANDARD_NOTES_DOMAINS = {"standardnotes.com", "standardnotes.org", "listed.to"};

    private OfflineAllowlist() {}

    /** Network isolation on: local network only */
    public static boolean isAllowedUrl(String url) {
        return isAllowedUrl(url, true);
    }

    /**
     * @param isolated network isolation on (local network only) or off (internet except Standard Notes)
     */
    public static boolean isAllowedUrl(String url, boolean isolated) {
        if (url == null) {
            return false;
        }

        URI uri;
        try {
            uri = new URI(url);
        } catch (Exception e) {
            return false;
        }

        String scheme = uri.getScheme();
        if (scheme == null) {
            /** Relative URL: resolves against the bundled file:// page */
            return true;
        }

        scheme = scheme.toLowerCase(Locale.ROOT);
        boolean isNetwork =
            scheme.equals("http") || scheme.equals("https") || scheme.equals("ws") || scheme.equals("wss");
        if (!isNetwork) {
            return true;
        }

        String host = uri.getHost();
        if (host == null || host.isEmpty()) {
            return false;
        }
        if (isLocalNetworkHost(host)) {
            return true;
        }
        if (isolated) {
            return false;
        }
        return !isStandardNotesHost(host);
    }

    public static boolean isStandardNotesHost(String rawHost) {
        String host = normalizeHost(rawHost);
        for (String domain : STANDARD_NOTES_DOMAINS) {
            if (host.equals(domain) || host.endsWith("." + domain)) {
                return true;
            }
        }
        return false;
    }

    static String normalizeHost(String rawHost) {
        String host = rawHost.toLowerCase(Locale.ROOT);
        if (host.endsWith(".")) {
            host = host.substring(0, host.length() - 1);
        }
        return host;
    }

    public static boolean isLocalNetworkHost(String rawHost) {
        String host = normalizeHost(rawHost);

        if (host.equals("localhost")) {
            return true;
        }
        for (String suffix : LOCAL_SUFFIXES) {
            if (host.endsWith(suffix)) {
                return true;
            }
        }

        if (host.startsWith("[") && host.endsWith("]")) {
            return isPrivateIPv6(host.substring(1, host.length() - 1));
        }

        int[] octets = parseIPv4(host);
        return octets != null && isPrivateIPv4(octets);
    }

    static int[] parseIPv4(String host) {
        String[] parts = host.split("\\.", -1);
        if (parts.length != 4) {
            return null;
        }
        int[] octets = new int[4];
        for (int i = 0; i < 4; i++) {
            if (!parts[i].matches("\\d{1,3}")) {
                return null;
            }
            octets[i] = Integer.parseInt(parts[i]);
            if (octets[i] > 255) {
                return null;
            }
        }
        return octets;
    }

    static boolean isPrivateIPv4(int[] o) {
        int a = o[0];
        int b = o[1];
        return a == 10
            || a == 127
            || (a == 172 && b >= 16 && b <= 31)
            || (a == 192 && b == 168)
            || (a == 169 && b == 254)
            || (a == 100 && b >= 64 && b <= 127);
    }

    static boolean isPrivateIPv6(String address) {
        String addr = address.toLowerCase(Locale.ROOT);
        int zone = addr.indexOf('%');
        if (zone >= 0) {
            addr = addr.substring(0, zone);
        }

        if (addr.equals("::1")) {
            return true;
        }

        if (addr.startsWith("::ffff:")) {
            String rest = addr.substring(7);
            int[] dotted = parseIPv4(rest);
            if (dotted != null) {
                return isPrivateIPv4(dotted);
            }
            String[] hextets = rest.split(":", -1);
            if (hextets.length == 2) {
                try {
                    int high = Integer.parseInt(hextets[0], 16);
                    int low = Integer.parseInt(hextets[1], 16);
                    return isPrivateIPv4(new int[] {high >> 8, high & 0xff, low >> 8, low & 0xff});
                } catch (NumberFormatException e) {
                    return false;
                }
            }
            return false;
        }

        String first = addr.split(":", -1)[0];
        if (first.isEmpty()) {
            return false;
        }
        int firstHextet;
        try {
            firstHextet = Integer.parseInt(first, 16);
        } catch (NumberFormatException e) {
            return false;
        }
        boolean uniqueLocal = (firstHextet & 0xfe00) == 0xfc00;
        boolean linkLocal = (firstHextet & 0xffc0) == 0xfe80;
        return uniqueLocal || linkLocal;
    }
}
