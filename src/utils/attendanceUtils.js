import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

export const getStudentPresentDays = async (studentName) => {
  try {
    const snapshot = await getDocs(collection(db, "dailyAttendance"));

    let count = 0;

    snapshot.forEach(doc => {
      const data = doc.data();
      const records = data.records || {};

      Object.values(records).forEach(record => {
        if (
          record.studentName === studentName &&
          record.status === "present"
        ) {
          count++;
        }
      });
    });

    return count;
  } catch (error) {
    console.error("Error fetching present days:", error);
    return 0;
  }
};
