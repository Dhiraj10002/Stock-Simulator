package response

type APIResponse struct {
    Success bool
    Message string
    Data any
    Errors any
}
func Success(message string, data any) APIResponse {
    return APIResponse{
        Success: true,
        Message: message,
        Data:    data,
        Errors:  nil,
    }
}
func Error(message string, errors any) APIResponse {
    return APIResponse{
        Success: false,
        Message: message,
        Data:    nil,
        Errors:  errors,
    }
}
