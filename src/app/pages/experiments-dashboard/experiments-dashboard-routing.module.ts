import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ExperimentsDashboardComponent } from './experiments-dashboard.component';

const routes: Routes = [
  { path: 'experiments-dashboard', component: ExperimentsDashboardComponent}
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ExperimentsDashboardRoutingModule { }
