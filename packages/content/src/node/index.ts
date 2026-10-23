import { type CompileResult, compileContent } from '../compile';
import { BASE_CONTENT_DIR, readPackageDir } from './read-package';

export { BASE_CONTENT_DIR, readPackageDir };

/** Compiles the base game plus the mod folders given, in the right load order. */
export function compileFromDirs(modDirs: readonly string[] = []): CompileResult {
  return compileContent([BASE_CONTENT_DIR, ...modDirs].map(readPackageDir));
}
