# Procedimiento de publicación

Solo se ejecuta cuando el responsable del proyecto pide expresamente «publica la versión X». Repositorio: `ssa727070-cmd/Pan-Bot`, rama `main`. Se usa la sesión local de `gh` y la identidad Git local; nunca se guardan tokens en el proyecto, no se añaden trailers `Co-authored-by` ni se modifica el autor.

1. **Revisar** `git status` y `git diff`; confirmar que todo pertenece a la versión.
2. **Sin secretos ni archivos personales:** ningún `.env`, `data/`, bases `.db/.sqlite`, logs ni claves en el commit (`git status --short`, y buscar tokens en `git diff`). No leer `.env`.
3. **Sincronizar versión:** `package.json` y `package-lock.json` (`npm install --package-lock-only --ignore-scripts`) con la misma versión X, sin actualizar dependencias.
4. **Instalación limpia y validaciones:** `npm ci`, `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run build`.
5. **Tests:** `npm test` debe pasar al 100 %.
6. **Documentación:** `README.md`, `CHANGELOG.md` (entrada de X sin «sin publicar») y `docs/releases/vX.md`.
7. **Versión libre:** `git tag -l vX`, `git ls-remote --tags origin vX` y `gh release view vX` no deben devolver nada; `git fetch origin` y `main` no debe estar por detrás.
8. **Commit** con `git add` de rutas concretas y `git commit` (sin `--author`).
9. **`git push origin main`** (nunca `--force`).
10. **Tag anotado:** `git tag -a vX -m "Pan Bot vX"`.
11. **`git push origin vX`.**
12. **Release:** `gh release create vX --repo ssa727070-cmd/Pan-Bot --title "Pan Bot vX" --notes-file docs/releases/vX.md --verify-tag`.
13. **Verificar:** `gh release view vX`, `git ls-remote --tags origin vX` y `git status -sb`.

Si cualquier paso falla, **detenerse** y explicar el problema: no crear tag ni release si el push anterior falló. Prohibido: force push, `reset --hard`, borrar tags/releases/repositorio/datos, reescribir historial.
