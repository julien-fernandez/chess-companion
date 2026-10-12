"""Une seule connexion : la fenêtre du navigateur (nginx) donne aussi le cookie de l'API, par /api/connexion."""
import pytest

from src.review_api import connexion_target


def test_un_utilisateur_authentifie_par_nginx_revient_sur_sa_page():
    assert connexion_target("/api/connexion?retour=%23revision", "julien") == "/#revision"
    assert connexion_target("/api/connexion", "julien") == "/"


def test_sans_utilisateur_transmis_par_nginx_pas_de_cookie():
    assert connexion_target("/api/connexion?retour=%23revision", "") is None
    assert connexion_target("/api/connexion", None) is None


@pytest.mark.parametrize("retour", ["https%3A%2F%2Fexemple.org", "%2F%2Fexemple.org", "%23a%2F..%2Fb", "revision"])
def test_le_retour_ne_mene_jamais_hors_du_site(retour):
    assert connexion_target(f"/api/connexion?retour={retour}", "julien") == "/"
