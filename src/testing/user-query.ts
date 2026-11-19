/**
 * In-memory stand-in for a User query builder.
 * password and sessionVersion stay off the row unless the caller addSelects
 * them, matching select:false. Specs that boot UserService use this so login
 * and session checks run the real addSelect path.
 */
export function userQueryBuilder<T extends object>(
  rows: readonly T[],
): UserQueryBuilder<T> {
  return new UserQueryBuilder(rows);
}

const SECRET_COLUMNS = ['password', 'sessionVersion'] as const;

class UserQueryBuilder<T extends object> {
  private readonly added = new Set<string>();
  private columns: string[] | null = null;
  private params: Record<string, unknown> = {};
  private sql: string[] = [];
  private rowLimit: number | undefined;

  constructor(private readonly rows: readonly T[]) {}

  select(fields?: string | string[]): this {
    if (Array.isArray(fields)) {
      this.columns = fields.map((field) => columnName(field));
    }
    return this;
  }

  addSelect(column: string): this {
    this.added.add(columnName(column));
    return this;
  }

  where(statement: string, params?: Record<string, unknown>): this {
    this.sql.push(statement);
    if (params) Object.assign(this.params, params);
    return this;
  }

  andWhere(statement: string, params?: Record<string, unknown>): this {
    return this.where(statement, params);
  }

  orderBy(): this {
    return this;
  }

  limit(count: number): this {
    this.rowLimit = count;
    return this;
  }

  async getMany(): Promise<Array<Partial<T>>> {
    let matched = this.rows.filter((row) => this.matches(row));
    if (this.rowLimit !== undefined) matched = matched.slice(0, this.rowLimit);
    return matched.map((row) => this.project(row));
  }

  async getOne(): Promise<Partial<T> | null> {
    const rows = await this.getMany();
    return rows[0] ?? null;
  }

  private matches(row: T): boolean {
    const { id, username, email } = this.params;
    if (id !== undefined && Number(field(row, 'id')) !== Number(id))
      return false;
    if (email !== undefined) {
      if (
        String(field(row, 'email') ?? '').toLowerCase() !==
        String(email).toLowerCase()
      ) {
        return false;
      }
    }
    if (username !== undefined) {
      const got = String(field(row, 'username') ?? '');
      const want = String(username);
      const folded = this.sql.some((statement) =>
        statement.includes('LOWER(user.username)'),
      );
      if (folded) {
        if (got.toLowerCase() !== want.toLowerCase()) return false;
      } else if (got !== want) {
        return false;
      }
    }
    return true;
  }

  private project(row: T): Partial<T> {
    const copy: Record<string, unknown> = {
      ...(row as Record<string, unknown>),
    };
    const allowed = this.columns ? new Set(this.columns) : null;
    for (const key of Object.keys(copy)) {
      const secret = (SECRET_COLUMNS as readonly string[]).includes(key);
      if (secret && !this.added.has(key)) {
        delete copy[key];
        continue;
      }
      if (allowed && !allowed.has(key) && !this.added.has(key)) {
        delete copy[key];
      }
    }
    return copy as Partial<T>;
  }
}

function columnName(field: string): string {
  const parts = field.split('.');
  return parts[parts.length - 1] ?? field;
}

function field(row: object, key: string): unknown {
  return (row as Record<string, unknown>)[key];
}
