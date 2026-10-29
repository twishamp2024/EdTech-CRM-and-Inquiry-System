export const INQUIRY_CREATED_MESSAGE = 'Thank you! Your inquiry has been received.';
export const INQUIRY_DUPLICATE_MESSAGE =
  'We have already received this inquiry. Our team will get back to you soon.';

export function createInquiryController({ inquiryService }) {
  return {
    /** POST /api/inquiries — 201 when stored, 200 when it repeats a recent identical submission. */
    async create(req, res) {
      const { inquiry, created } = await inquiryService.createInquiry(req.validated.body);

      res.status(created ? 201 : 200).json({
        success: true,
        message: created ? INQUIRY_CREATED_MESSAGE : INQUIRY_DUPLICATE_MESSAGE,
        data: { id: inquiry.id, duplicate: !created },
      });
    },

    /** GET /api/inquiries (admin) */
    async list(req, res) {
      const { inquiries, meta } = await inquiryService.listInquiries(req.validated.query);
      res.set('Cache-Control', 'no-store').json({ success: true, data: inquiries, meta });
    },

    /** GET /api/inquiries/:id (admin) */
    async show(req, res) {
      const inquiry = await inquiryService.getInquiry(req.validated.params.id);
      res.set('Cache-Control', 'no-store').json({ success: true, data: inquiry });
    },

    /** PATCH /api/inquiries/:id/status (admin) */
    async updateStatus(req, res) {
      const inquiry = await inquiryService.updateInquiryStatus(
        req.validated.params.id,
        req.validated.body.status,
      );
      res.json({ success: true, message: 'Status updated.', data: inquiry });
    },
  };
}
