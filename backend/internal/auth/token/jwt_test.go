package token

import "testing"

func TestRefreshTokensHaveUniqueIDsWhenIssuedTogether(t *testing.T) {
	const secret = "test-secret"
	const userID = "f47ac10b-58cc-4372-a567-0e02b2c3d479"

	first, err := GenerateRefreshToken(secret, userID)
	if err != nil {
		t.Fatal(err)
	}
	second, err := GenerateRefreshToken(secret, userID)
	if err != nil {
		t.Fatal(err)
	}
	if first == second {
		t.Fatal("refresh tokens issued together must not be identical")
	}

	firstClaims, err := Parse(secret, first)
	if err != nil {
		t.Fatal(err)
	}
	secondClaims, err := Parse(secret, second)
	if err != nil {
		t.Fatal(err)
	}
	if firstClaims.ID == "" || secondClaims.ID == "" || firstClaims.ID == secondClaims.ID {
		t.Fatalf("expected distinct non-empty token IDs, got %q and %q", firstClaims.ID, secondClaims.ID)
	}
}
