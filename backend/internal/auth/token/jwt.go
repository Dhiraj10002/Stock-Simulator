package token

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type Claims struct {
	UserID    string `json:"user_id"`
	TokenType string `json:"token_type"`
	jwt.RegisteredClaims
}

const (
	accessTokenLifetime  = 15 * time.Minute
	refreshTokenLifetime = 7 * 24 * time.Hour
)

func GenerateAccessToken(secret, userID string) (string, error) {
	tokenString, err := generate(
		secret,
		userID,
		"access",
		accessTokenLifetime,
	)

	return tokenString, err
}

func GenerateRefreshToken(secret, userID string) (string, error) {
	return generate(
		secret,
		userID,
		"refresh",
		refreshTokenLifetime,
	)
}

func generate(
	secret string,
	userID string,
	tokenType string,
	lifetime time.Duration,
) (string, error) {
	jti := uuid.NewString()

	claims := Claims{
		UserID:    userID,
		TokenType: tokenType,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        jti,
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(lifetime)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	signedToken, err := token.SignedString([]byte(secret))
	if err != nil {
		return "", err
	}

	return signedToken, nil
}

func Parse(secret, tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(
		tokenString,
		&Claims{},
		func(token *jwt.Token) (interface{}, error) {
			if token.Method != jwt.SigningMethodHS256 {
				return nil, fmt.Errorf(
					"unexpected signing method: %s",
					token.Header["alg"],
				)
			}

			return []byte(secret), nil
		},
	)

	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid || claims.ExpiresAt == nil {
		return nil, fmt.Errorf("invalid token claims")
	}

	return claims, nil
}
