import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
    // const env = loadEnv(mode, process.cwd());

    if (!process.env.VITE_LAUNCH_EDITOR) {
        process.env.LAUNCH_EDITOR = "code";
    } else {
        process.env.LAUNCH_EDITOR = process.env.VITE_LAUNCH_EDITOR;
    }

    return {
        plugins: [tailwindcss(), reactRouter()],
        resolve: {
            tsconfigPaths: true,
        },
    };
});
