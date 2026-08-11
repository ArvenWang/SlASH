import "./styles.css";
import { bootstrapSlashApplication } from "./application";

void bootstrapSlashApplication().catch((error: unknown) => {
  console.error("Project Slash failed to start.", error);
  const loadingLabel = document.querySelector<HTMLElement>("#loading-label");
  if (loadingLabel) loadingLabel.textContent = "COMBAT SPACE STARTUP FAILED";
});
