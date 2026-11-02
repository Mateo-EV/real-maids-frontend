import { ViewService } from "@ngneat/overview"
import { HotToastService, provideHotToastConfig, ToastConfig } from "@ngxpert/hot-toast"

/** Keep all three providers in each lazy route; the body overlay uses ViewService's injector. */
export function provideCatalogToast(config?: Partial<ToastConfig>) {
  return [HotToastService, ViewService, provideHotToastConfig(config)]
}
