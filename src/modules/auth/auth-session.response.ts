/** Access token and verification flag. The refresh token stays in the cookie. */
export class AuthSessionResponse {
  access_token: string;
  emailVerified: boolean;

  static from(session: {
    access_token: string;
    emailVerified: boolean;
  }): AuthSessionResponse {
    const response = new AuthSessionResponse();
    response.access_token = session.access_token;
    response.emailVerified = session.emailVerified;
    return response;
  }
}
