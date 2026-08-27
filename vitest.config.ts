import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    /* Cinq secondes (le défaut) ne suffisent plus. Les tests de PAGE montent
       l'écran entier dans jsdom — la journée d'Activité, ses vingt-quatre heures
       de grille et son graphe de semaine prennent 700 ms à eux seuls — et la
       suite en fait tourner plusieurs de front. Mesuré isolément : 0,7 s ; sous
       la charge des autres fichiers : au-delà de 5 s, d'où des échecs qui
       n'avaient rien à voir avec le code testé. Le plafond reste un plafond : un
       test réellement bloqué échoue toujours, un peu plus tard. */
    testTimeout: 20_000,
    include: ["tests/**/*.test.{ts,tsx}", "lib/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
