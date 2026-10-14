-- CreateTable
CREATE TABLE "LessonSurvey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lessonId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "clarity" INTEGER,
    "difficulty" INTEGER,
    "pace" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LessonSurvey_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LessonSurvey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LessonSurveyRead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "surveyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LessonSurveyRead_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "LessonSurvey" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LessonSurveyRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LessonSurvey_lessonId_createdAt_idx" ON "LessonSurvey"("lessonId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LessonSurvey_userId_lessonId_key" ON "LessonSurvey"("userId", "lessonId");

-- CreateIndex
CREATE INDEX "LessonSurveyRead_userId_idx" ON "LessonSurveyRead"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonSurveyRead_surveyId_userId_key" ON "LessonSurveyRead"("surveyId", "userId");
