import { bootstrapRedesignApplication } from "./redesign/application";

try {
  bootstrapRedesignApplication();
} catch (error: unknown) {
  console.error("Project Slash failed to start.", error);
  document.body.textContent = "游戏启动失败";
}
