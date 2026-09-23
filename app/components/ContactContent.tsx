/**
 * Contact channels shown on /pages/contact. Fill in the ones you use; any
 * left empty are simply not shown.
 *  - email:     'hola@tudominio.com'
 *  - whatsapp:  full international number, digits only, e.g. '34600111222'
 *  - instagram: handle without the @, e.g. 'autocareexpress'
 *  - hours:     free text, e.g. 'Lunes a viernes, 9:00–18:00'
 */
const CONTACT = {
  email: '',
  whatsapp: '',
  instagram: '',
  hours: '',
};

type Channel = {label: string; value: string; href?: string; cta?: string};

function getChannels(): Channel[] {
  const channels: Channel[] = [];
  if (CONTACT.email) {
    channels.push({
      label: 'Email',
      value: CONTACT.email,
      href: `mailto:${CONTACT.email}`,
      cta: 'Escribir',
    });
  }
  if (CONTACT.whatsapp) {
    channels.push({
      label: 'WhatsApp',
      value: `+${CONTACT.whatsapp}`,
      href: `https://wa.me/${CONTACT.whatsapp}`,
      cta: 'Abrir chat',
    });
  }
  if (CONTACT.instagram) {
    channels.push({
      label: 'Instagram',
      value: `@${CONTACT.instagram}`,
      href: `https://instagram.com/${CONTACT.instagram}`,
      cta: 'Ver perfil',
    });
  }
  if (CONTACT.hours) {
    channels.push({label: 'Horario de atención', value: CONTACT.hours});
  }
  return channels;
}

export function ContactContent({bodyHtml}: {bodyHtml: string}) {
  const channels = getChannels();

  return (
    <div className="contact-layout">
      <div className="contact-intro">
        <p className="contact-lede">
          ¿Dudas sobre qué producto usar, el estado de un pedido o una
          colaboración? Escríbenos y te responderemos personalmente.
        </p>
        {bodyHtml && (
          <div
            className="page-prose"
            dangerouslySetInnerHTML={{__html: bodyHtml}}
          />
        )}
      </div>

      <div className="contact-channels">
        {channels.length > 0 ? (
          channels.map((channel) =>
            channel.href ? (
              <a
                key={channel.label}
                className="contact-card"
                href={channel.href}
                target={channel.href.startsWith('http') ? '_blank' : undefined}
                rel="noopener noreferrer"
              >
                <ChannelBody channel={channel} />
              </a>
            ) : (
              <div key={channel.label} className="contact-card">
                <ChannelBody channel={channel} />
              </div>
            ),
          )
        ) : (
          <div className="contact-card">
            <span className="contact-card-label">Atención al cliente</span>
            <span className="contact-card-value">
              Muy pronto publicaremos aquí nuestros canales de contacto.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ChannelBody({channel}: {channel: Channel}) {
  return (
    <>
      <span className="contact-card-label">{channel.label}</span>
      <span className="contact-card-value">{channel.value}</span>
      {channel.cta && (
        <span className="contact-card-cta">
          {channel.cta} <span aria-hidden="true">&rarr;</span>
        </span>
      )}
    </>
  );
}
