import type * as React from "react";

const Logo = (props: React.SVGProps<SVGSVGElement>) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width={819}
		height={715}
		viewBox="0 0 819 715"
		aria-label="Navirex logo"
		{...props}
	>
		<image href="/navirex-logo.svg" width="819" height="715" />
	</svg>
);
export default Logo;
