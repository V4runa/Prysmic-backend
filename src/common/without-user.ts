/**
 * A response-shaped copy of an entity. The stored row is left alone so a later
 * save in the same request still has its owner foreign key. `user` is removed
 * from the copy and from nested tags, which is where a loaded account (and its
 * password hash) would otherwise be serialized.
 */
export function withoutUser<T extends object>(entity: T): T {
  if (entity == null || typeof entity !== 'object') return entity;
  const prototype = Object.getPrototypeOf(entity) as object | null;
  const clone = Object.assign(
    prototype ? Object.create(prototype) : {},
    entity,
  ) as T & {
    user?: unknown;
    tags?: unknown[];
  };
  if ('user' in clone) delete clone.user;
  if (Array.isArray(clone.tags)) {
    clone.tags = clone.tags.map((tag) =>
      tag && typeof tag === 'object' ? withoutUser(tag as object) : tag,
    );
  }
  return clone;
}
