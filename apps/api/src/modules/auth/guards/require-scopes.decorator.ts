import { SetMetadata } from '@nestjs/common';

export const REQUIRE_SCOPES_KEY = 'requireScopes';

/**
 * Escopos exigidos quando a requisição autentica por API Key.
 * Ignorado no caminho JWT (lá vale @CompanyRoles).
 */
export const RequireScopes = (...scopes: string[]) => SetMetadata(REQUIRE_SCOPES_KEY, scopes);
