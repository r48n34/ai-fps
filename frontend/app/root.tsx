// Import styles of packages that you've installed.
// All packages except `@mantine/hooks` require styles imports
import "@mantine/core/styles.css";
import {
    ColorSchemeScript,
    MantineProvider,
    mantineHtmlProps,
} from "@mantine/core";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

import "./app.css";

export function Layout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" {...mantineHtmlProps}>
            <head>
                <meta charSet="utf-8" />
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1"
                />
                <ColorSchemeScript />
                <Meta />
                <Links />
            </head>
            <body>
                <MantineProvider>{children}</MantineProvider>
                <ScrollRestoration />
                <Scripts />
            </body>
        </html>
    );
}

export default function App() {
    return <Outlet />;
}
