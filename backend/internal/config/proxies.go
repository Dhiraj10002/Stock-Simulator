package config

import (
	"fmt"
	"net"
	"strings"
)

// An unset allowlist trusts no forwarding headers. Only literal addresses and
// bounded CIDRs are accepted; trusting the entire internet enables IP spoofing.
func parseTrustedProxies(value string) ([]string, error) {
	if strings.TrimSpace(value) == "" {
		return nil, nil
	}
	var proxies []string
	for _, entry := range strings.Split(value, ",") {
		entry = strings.TrimSpace(entry)
		if net.ParseIP(entry) == nil {
			_, network, err := net.ParseCIDR(entry)
			if err != nil {
				return nil, fmt.Errorf("TRUSTED_PROXIES must contain IP addresses or CIDRs; invalid entry %q", entry)
			}
			ones, _ := network.Mask.Size()
			if ones == 0 || (network.IP.To4() != nil && len(network.Mask) == net.IPv6len && ones <= 96) {
				return nil, fmt.Errorf("TRUSTED_PROXIES must not trust all addresses; use the gateway IP or a bounded CIDR")
			}
		}
		proxies = append(proxies, entry)
	}
	return proxies, nil
}
