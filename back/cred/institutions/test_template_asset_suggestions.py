from io import BytesIO
from unittest.mock import patch
from PIL import Image
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient
from accounts.models import User, Role
from .models import Institution, CertificateTemplateRevision
from .template_asset_suggestions import suggest_asset_size


def artwork(width=400, height=200):
    output = BytesIO()
    Image.new("RGB", (width, height), "navy").save(output, format="PNG")
    return SimpleUploadedFile("logo.png", output.getvalue(), content_type="image/png")


class AssetSizingTests(SimpleTestCase):
    analysis = {"pages": [{"page": 1, "width": 600, "height": 800, "lines": []}]}

    @patch("institutions.template_asset_suggestions.request_classification")
    def test_size_preserves_physical_aspect_ratio_and_avoids_fields(self, classify):
        classify.return_value = {"items": [{"width_fraction": .2}]}
        fields = [{"key": "student_name", "page": 1, "x": .3, "y": .02, "width": .4, "height": .1}]
        result = suggest_asset_size(artwork(), "logo", self.analysis, fields)
        field = result["field"]
        self.assertAlmostEqual(field["width"] * 600 / (field["height"] * 800), 2)
        self.assertGreaterEqual(result["width_points"], 48)
        self.assertFalse(field["clear"])
        self.assertFalse(field["x"] < .7 and field["x"]+field["width"] > .3 and field["y"] < .12)
        self.assertNotIn("image/png", str(classify.call_args))

    @patch("institutions.template_asset_suggestions.request_classification")
    def test_invalid_ai_sizes_are_rejected(self, classify):
        for width in [True, -1, 2, float("nan"), "0.2", None]:
            with self.subTest(width=width):
                classify.return_value = {"items": [{"width_fraction": width}]}
                with self.assertRaises(ValueError):
                    suggest_asset_size(artwork(), "logo", self.analysis, [])

    @patch("institutions.template_asset_suggestions.request_classification")
    def test_crowded_page_does_not_get_overlapping_image(self, classify):
        classify.return_value = {"items": [{"width_fraction": .2}]}
        analysis = {"pages": [{"page": 1, "width": 600, "height": 800,
            "lines": [{"bbox": [0, 0, 600, 800]}]}]}
        result = suggest_asset_size(artwork(), "seal", analysis, [])
        self.assertTrue(result["placement_required"])
        self.assertEqual(result["width_points"], 120)
        self.assertIn("Choose a position", result["note"])

    @patch("institutions.template_asset_suggestions.request_classification")
    def test_search_finds_gap_between_old_preset_rows(self, classify):
        classify.return_value = {"items": [{"width_fraction": .2}]}
        analysis = {"pages": [{"page": 1, "width": 600, "height": 800,
            "lines": [{"bbox": [0, 0, 600, 320]}, {"bbox": [0, 390, 600, 800]}]}]}
        result = suggest_asset_size(artwork(), "logo", analysis, [])
        self.assertFalse(result["placement_required"])
        field = result["field"]
        self.assertGreaterEqual(field["y"] * 800, 324)
        self.assertLessEqual((field["y"] + field["height"]) * 800, 386.000001)

    @patch("institutions.template_asset_suggestions.request_classification")
    def test_shrinks_to_fit_narrow_gap_without_overlapping(self, classify):
        classify.return_value = {"items": [{"width_fraction": .2}]}
        fields = [{"key": "static_text", "page": 1, "x": x, "y": 0, "width": 1/3 if x == 0 else .5, "height": 1}
                  for x in [0, .5]]
        result = suggest_asset_size(artwork(), "seal", self.analysis, fields)
        self.assertFalse(result["placement_required"])
        self.assertLess(result["width_points"], 120)
        self.assertGreaterEqual(result["width_points"], 64)
        field = result["field"]
        self.assertGreaterEqual(field["x"] * 600, 204)
        self.assertLessEqual((field["x"] + field["width"]) * 600, 296.000001)
        self.assertAlmostEqual(field["width"] * 600 / (field["height"] * 800), 2)

    @patch("institutions.template_asset_suggestions.request_classification")
    def test_preserves_previous_image_center_when_free(self, classify):
        classify.return_value = {"items": [{"width_fraction": .2}]}
        previous = {"key": "logo", "page": 1, "x": .4, "y": .4, "width": .2, "height": .075}
        result = suggest_asset_size(artwork(), "logo", self.analysis, [previous])
        self.assertFalse(result["placement_required"])
        self.assertAlmostEqual(result["field"]["x"], .4)
        self.assertAlmostEqual(result["field"]["y"], .4)


class AssetSizingAccessTests(TestCase):
    def setUp(self):
        self.institution = Institution.objects.create(institution_id="ASSET-SIZE", name="University")
        self.registrar = User.objects.create_user(email="asset-size@example.test", role=Role.REGISTRAR, institution=self.institution)
        self.revision = CertificateTemplateRevision.objects.create(institution=self.institution, name="Draft")
        self.client = APIClient()
        self.client.force_authenticate(self.registrar)
        self.url = f"/api/certificate-templates/{self.revision.pk}/asset-suggestions/"

    @patch("institutions.template_views.extract_template_analysis", return_value=AssetSizingTests.analysis)
    @patch("institutions.template_asset_suggestions.request_classification", return_value={"items": [{"width_fraction": .2}]})
    def test_upload_returns_review_proposal_without_saving(self, classify, extract):
        response = self.client.post(self.url, {"key": "logo", "page": "1", "fields": "[]", "image": artwork()}, format="multipart")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["field"]["key"], "logo")
        self.revision.refresh_from_db()
        self.assertEqual(self.revision.fields, [])
        self.assertFalse(self.revision.logo)

    @patch("institutions.template_asset_suggestions.request_classification")
    def test_other_institution_cannot_request_sizes(self, classify):
        other = Institution.objects.create(institution_id="ASSET-OTHER", name="Other")
        self.revision.institution = other
        self.revision.save(update_fields=["institution"])
        response = self.client.post(self.url, {"key": "logo", "image": artwork()}, format="multipart")
        self.assertEqual(response.status_code, 404)
        classify.assert_not_called()


class LocalArtworkTests(SimpleTestCase):
    @patch("institutions.template_asset_suggestions.request_classification")
    def test_local_image_sizing_never_calls_ai(self, classify):
        result = suggest_asset_size(artwork(), "logo", AssetSizingTests.analysis, [], local=True)
        field = result["field"]
        self.assertAlmostEqual(field["width"]*600/(field["height"]*800), 2)
        classify.assert_not_called()

    @patch("institutions.template_asset_suggestions.request_classification")
    def test_local_discovery_includes_images_and_institution_without_overlaps(self, classify):
        from types import SimpleNamespace
        from .template_local_assets import add_local_artwork
        from .template_vision import overlaps
        result = {"items": [], "warnings": [], "checked_fields": ["institution_name", "logo", "seal"]}
        revision = SimpleNamespace(logo=None, seal=None, institution=SimpleNamespace(name="University"))
        add_local_artwork(result, revision, AssetSizingTests.analysis, [], {"logo": artwork(), "seal": artwork(200, 200)}, 1)
        fields = [item["field"] for item in result["items"]]
        self.assertEqual({f["key"] for f in fields}, {"logo", "seal", "institution_name"})
        for i, field in enumerate(fields):
            self.assertFalse(any(overlaps(field, other) for other in fields[i+1:]))
        self.assertEqual(result["missing_fields"], [])
        classify.assert_not_called()
