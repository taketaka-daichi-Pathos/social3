import { inject, Injectable } from '@angular/core';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';

@Injectable({ providedIn: 'root' })
export class DependentDocumentUploadService {
  private readonly storage = inject(Storage);

  async uploadDependentDocuments(
    companyOwnerUid: string,
    employeeId: string,
    files: File[]
  ): Promise<string[]> {
    if (files.length === 0) {
      throw new Error('証明書類を1件以上アップロードしてください');
    }

    const uploads = files.map((file, index) => {
      const safeName = file.name.replace(/[^\w.-]+/g, '_');
      const path = `companies/${companyOwnerUid}/employees/${employeeId}/dependent-documents/${Date.now()}-${index}-${safeName}`;
      const storageRef = ref(this.storage, path);
      return uploadBytes(storageRef, file).then(() => getDownloadURL(storageRef));
    });

    return Promise.all(uploads);
  }
}
