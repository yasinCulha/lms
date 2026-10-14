import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, matchPath, useLocation } from 'react-router-dom';
import { Sidebar } from '../Sidebar';
import { Topbar } from '../Topbar';
import { useCurrentUser } from '../../data/useCurrentUser';
import { LessonSurveyDialog } from '../../features/surveys/LessonSurveyDialog';
import { InstructorSurveyInbox } from '../../features/surveys/InstructorSurveyInbox';
import styles from './AppShell.module.css';

const LESSON_ROUTE = '/kurslarim/:courseId/ders/:lessonId';

/** Sidebar + Topbar kabuğu; sayfalar <Outlet /> içine render edilir. */
export function AppShell() {
  const { user, switchRole } = useCurrentUser();
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [surveyLessonId, setSurveyLessonId] = useState<string | null>(null);
  const location = useLocation();
  const previousPath = useRef(location.pathname);

  // Rota değiştiğinde mobil çekmece kapanır.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Öğrenci bir ders ekranından ayrılınca o dersin anketi istenir; dialog, ders tamamlanmamışsa
  // ya da anket zaten yanıtlandıysa sunucuya sorup sessizce kapanır.
  useEffect(() => {
    const left = matchPath(LESSON_ROUTE, previousPath.current)?.params.lessonId;
    const now = matchPath(LESSON_ROUTE, location.pathname)?.params.lessonId;
    previousPath.current = location.pathname;
    if (left && left !== now && user?.role === 'STUDENT') setSurveyLessonId(left);
  }, [location.pathname, user?.role]);

  const closeSurvey = useCallback(() => setSurveyLessonId(null), []);

  return (
    <div className={styles.shell}>
      <a href="#main-content" className="skip-link">
        İçeriğe geç
      </a>

      <Sidebar user={user} isOpen={isMenuOpen} onNavigate={() => setMenuOpen(false)} />

      {isMenuOpen ? (
        <button
          type="button"
          className={styles.scrim}
          aria-label="Menüyü kapat"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <div className={styles.body}>
        <Topbar
          user={user}
          switchRole={switchRole}
          isMenuOpen={isMenuOpen}
          onMenuToggle={() => setMenuOpen((open) => !open)}
        />
        <main id="main-content" className={styles.main}>
          <Outlet />
        </main>
      </div>

      {surveyLessonId && <LessonSurveyDialog key={surveyLessonId} lessonId={surveyLessonId} onClose={closeSurvey} />}
      {user?.role === 'INSTRUCTOR' && <InstructorSurveyInbox key={user.id} userId={user.id} />}
    </div>
  );
}
