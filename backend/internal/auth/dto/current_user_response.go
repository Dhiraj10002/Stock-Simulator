package dto

type CurrentUserResponse struct {
	ID    uint   `json:"id"`
	UUID  string `json:"uuid"`
	Name  string `json:"name"`
	Email string `json:"email"`
}
