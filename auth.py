from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from database import get_user_by_id, get_user_by_username, create_user

class User(UserMixin):
    def __init__(self, id, username, is_admin):
        self.id = id
        self.username = username
        self.is_admin = bool(is_admin)

    @staticmethod
    def get(user_id):
        row = get_user_by_id(user_id)
        if row:
            return User(row['id'], row['username'], row['is_admin'])
        return None

    @staticmethod
    def get_by_username(username):
        row = get_user_by_username(username)
        if row:
            return User(row['id'], row['username'], row['is_admin'])
        return None

    @staticmethod
    def create(username, password, is_admin=0):
        hashed = generate_password_hash(password)
        return create_user(username, hashed, is_admin)

    def check_password(self, password):
        row = get_user_by_username(self.username)
        if row:
            return check_password_hash(row['password_hash'], password)
        return False