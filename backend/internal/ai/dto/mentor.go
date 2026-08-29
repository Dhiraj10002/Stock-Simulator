package dto

type MentorRequest struct {
	Question string `json:"question" binding:"required,min=5,max=2000"`
}

type MentorResponse struct {
	Answer string `json:"answer"`
}
