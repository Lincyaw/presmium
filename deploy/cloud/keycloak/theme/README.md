# Presmium login theme

This theme targets Keycloak 26.8.1 and inherits its `base` login templates. It has no FreeMarker overrides. Login, registration, password reset, error rendering, hidden form values, validation, locale switching, and password visibility remain owned by Keycloak.

Build from the repository root:

```sh
node deploy/cloud/keycloak/build-theme.mjs /theme-output
```

Copy `/theme-output/presmium` to `/opt/keycloak/themes/presmium`, and set the realm’s `loginTheme` to `presmium`. The builder only requires Node and the dependencies of `@lincyaw/design`. It resolves the public `@lincyaw/design/design.css` entry, inlines its imports without changing shared rules, and packages all referenced WOFF/WOFF2 files and their OFL licenses. Generated resources stay outside the source theme directory.

The four CSS/JavaScript entries receive individual SHA-256 content fingerprints after generation: `design.<hash>.css`, `layout.<hash>.css`, `brand.<hash>.js`, and `appearance.<hash>.js`. The generated `theme.properties` references those filenames in their original load order. Source filenames stay stable; unversioned entry copies are removed from the output. A normal page refresh therefore requests changed assets under new URLs while retaining Keycloak’s production static caching. Font URLs are already content-addressed and remain relative to the generated CSS directory.

`theme.properties` maps the official base templates’ class slots to public `pm-ui-*` controls. `layout.css` arranges the authentication shell, fields, options, and responsive layout; it does not redefine control appearance. `appearance.js` supplies classes for official nodes without a class slot, maps message severity to public notice variants, associates field errors, and displays the official password toggle’s translated accessible name without replacing its original first child or handler.

The realm supports `en` and `zh-CN`. The two local message bundles have matching keys; other authentication messages inherit Keycloak’s translations. `ui_locales` uses Keycloak’s locale selection. The application additionally passes `ui_theme=light|dark`: the script accepts those two appearance hints, keeps the choice in authentication-origin session storage for subsequent forms, and otherwise follows `prefers-color-scheme`. This parameter selects appearance only; the realm selects the actual theme.

Reference contracts: [official theme extension guide](https://www.keycloak.org/ui-customization/themes), [26.8.1 base layout](https://github.com/keycloak/keycloak/blob/26.8.1/themes/src/main/resources/theme/base/login/template.ftl), [class properties](https://github.com/keycloak/keycloak/blob/26.8.1/themes/src/main/resources/theme/keycloak/login/theme.properties), and [password toggle](https://github.com/keycloak/keycloak/blob/26.8.1/themes/src/main/resources/theme/base/login/resources/js/passwordVisibility.js).
