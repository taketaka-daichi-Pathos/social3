import { inject, Injectable } from '@angular/core';

import { Auth } from '@angular/fire/auth';

import { EmployeeService } from '@core/services/employee.service';

import { WorkflowRequestService } from '@core/services/workflow-request.service';

import { requireAuthenticatedUser } from '@core/utils/auth.utils';

import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';

import {

  buildEmployeeMasterUpdatesFromApplication,

} from '@features/applications/utils/application-workflow-comparison.utils';

import { WorkflowRequest } from '@features/workflow/models/workflow-request.model';

import {

  isChangeApplicationWorkflowRequestType,

  isCommuteChangeWorkflowRequestType,

} from '@features/workflow/utils/workflow-navigation.utils';

import { firstValueFrom, take } from 'rxjs';



@Injectable({ providedIn: 'root' })

export class ApplicationApprovalService {

  private readonly auth = inject(Auth);

  private readonly requestService = inject(WorkflowRequestService);

  private readonly employeeService = inject(EmployeeService);



  async approveApplication(request: WorkflowRequest): Promise<void> {

    if (

      request.status !== 'pending' ||

      !isChangeApplicationWorkflowRequestType(request.type)

    ) {

      throw new Error('承認できない申請です');

    }



    const user = await requireAuthenticatedUser(this.auth);

    const employees = await firstValueFrom(this.employeeService.watchEmployees().pipe(take(1)));

    const employee = employees.find((row) => row.id === request.targetEmployeeId);



    if (!employee) {

      throw new Error('対象従業員が見つかりません');

    }



    const skipMasterUpdate = isCommuteChangeWorkflowRequestType(request.type);



    if (!skipMasterUpdate) {

      const masterUpdates = buildEmployeeMasterUpdatesFromApplication(request);

      if (Object.keys(masterUpdates).length === 0) {

        throw new Error('申請内容から更新項目を特定できません');

      }



      try {

        await this.employeeService.updateEmployeeApplicationFields(

          request.targetEmployeeId,

          masterUpdates

        );

      } catch (error) {

        throw new Error(toFirestoreErrorMessage(error, '申請の承認に失敗しました'));

      }

    }



    try {

      await this.requestService.updateRequest(user.uid, request.id, { status: 'approved' });

    } catch (error) {

      throw new Error(toFirestoreErrorMessage(error, '申請の承認に失敗しました'));

    }

  }

}

