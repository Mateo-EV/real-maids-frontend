import { ChangeDetectionStrategy, Component } from "@angular/core"
import { RouterOutlet } from "@angular/router"
import { OperationsSectionNavigation } from "../../components/operations-section-navigation/operations-section-navigation"

/**
 * Persistent Operaciones frame: the tab navigation is a sibling of the outlet, so switching
 * consumers never re-creates it and never dispatches another read.
 */
@Component({
  selector: "app-operations-shell",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, OperationsSectionNavigation],
  templateUrl: "./operations-shell.html"
})
export class OperationsShell {}
