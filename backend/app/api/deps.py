from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import ProviderProfile, User, UserRole, VerificationStatus
from app.db.session import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_v1_prefix}/auth/login/form")

# Platform operators (admin UI). Config/SMTP stays ADMIN-only.
STAFF_ROLES = (UserRole.ADMIN, UserRole.CUSTOMER_SERVICE)


def is_staff(user: User | UserRole | str | None) -> bool:
    if user is None:
        return False
    role = user.role if isinstance(user, User) else user
    if isinstance(role, UserRole):
        return role in STAFF_ROLES
    return str(role) in {r.value for r in STAFF_ROLES}


def require_staff():
    """Admin or customer service — same ops access except Config."""
    return require_roles(*STAFF_ROLES)


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        uid = UUID(user_id)
    except (JWTError, ValueError) as exc:
        raise credentials_exception from exc

    user = db.get(User, uid)
    if user is None or not user.is_active:
        raise credentials_exception

    if user.role == UserRole.PROVIDER:
        profile = db.query(ProviderProfile).filter(ProviderProfile.user_id == user.id).first()
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Provider profile not found",
            )
        if profile.verification_status in (
            VerificationStatus.APPROVED,
            VerificationStatus.REVOKED,
            VerificationStatus.REJECTED,
        ):
            return user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Your account is currently being reviewed. "
                "Please keep checking email from us in next 24hrs. "
                "Login is available after admin approval."
            ),
        )
    return user


def require_roles(*roles: UserRole):
    async def _checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of roles: {[r.value for r in roles]}",
            )
        return current_user

    return _checker
