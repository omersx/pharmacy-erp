from fastapi import Request
from fastapi.responses import JSONResponse
import uuid

class AppException(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400, fields: dict = None):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.fields = fields or {}

class NotFoundError(AppException):
    def __init__(self, message: str = "Resource not found"):
        super().__init__("NOT_FOUND", message, 404)

class ValidationError(AppException):
    def __init__(self, message: str = "Validation error", fields: dict = None):
        super().__init__("VALIDATION_ERROR", message, 422, fields)

class AuthError(AppException):
    def __init__(self, message: str = "Authentication failed"):
        super().__init__("AUTH_ERROR", message, 401)

class PermissionError(AppException):
    def __init__(self, message: str = "Permission denied"):
        super().__init__("PERMISSION_DENIED", message, 403)

class ConflictError(AppException):
    def __init__(self, message: str = "Resource conflict"):
        super().__init__("CONFLICT", message, 409)

async def app_exception_handler(request: Request, exc: AppException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "correlation_id": str(uuid.uuid4()),
                "fields": exc.fields
            }
        }
    )
