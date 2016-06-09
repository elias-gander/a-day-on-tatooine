// Phong Fragment Shader
// Disclaimer: This phong shader implementation is neither performance optimized nor beautifully coded.
// It shows the basic priciples in a simple way and is sufficient for our lab exercises.
precision mediump float;

#define MAX_LIGHTS 2

/**
 * definition of a material structure containing common properties
 */
struct Material {
	vec4 ambient;
	vec4 diffuse;
	vec4 specular;
	vec4 emission;
	float shininess;
};

/**
 * definition of the light properties related to material properties
 */
struct Light {
	vec4 ambient;
	vec4 diffuse;
	vec4 specular;
	// allow spotlights
	float coneAngle;
	vec3 coneDirection;
};

//illumination related variables
uniform Material u_material;
uniform Light u_light[MAX_LIGHTS];
varying vec3 v_normalVec;
varying vec3 v_eyeVec;
varying vec3 v_lightVec[MAX_LIGHTS];
varying vec3 v_lightToSurface[MAX_LIGHTS];

//texture related variables
uniform bool u_enableObjectTexture;
varying vec2 v_texCoord;
uniform sampler2D u_tex;

//shadow map resolution (required for extra task)
uniform float u_shadowMapWidth;
uniform float u_shadowMapHeight;

//shadow related variables
varying vec4 v_shadowMapTexCoord[MAX_LIGHTS];
uniform sampler2D u_depthMap;

vec4 calculateSimplePointLight(Light light, Material material, vec3 lightVec, vec3 normalVec, vec3 eyeVec, vec4 textureColor, vec4 shadowMapTexCoord, float spotlightCoeff) {
	lightVec = normalize(lightVec);
	normalVec = normalize(normalVec);
	eyeVec = normalize(eyeVec);

	//compute diffuse term
	float diffuse = max(dot(normalVec,lightVec),0.0);

	//compute specular term
	vec3 reflectVec = reflect(-lightVec,normalVec);
	float spec = pow( max( dot(reflectVec, eyeVec), 0.0) , material.shininess);

  if(u_enableObjectTexture)
  {
		//replace diffuse and ambient matrial with texture color if texture is available
    material.diffuse = textureColor;
    material.ambient = textureColor;
		//Note: an alternative to replacing the material color is to multiply it with the texture color
  }

	vec4 c_amb  = clamp(light.ambient * material.ambient, 0.0, 1.0);
	vec4 c_diff = clamp(diffuse * light.diffuse * material.diffuse, 0.0, 1.0);
	vec4 c_spec = clamp(spec * light.specular * material.specular, 0.0, 1.0);
	vec4 c_em   = material.emission;

	// TODO:
	//Note: You can directly use the shadow related varying/uniform variables in this example since we only have 1 light source.
	//Normally you should pass them to the calculateSimplePointLight function as parameters since they change for each light source!

  //TASK 2.3: apply perspective division to v_shadowMapTexCoord and save to shadowMapTexCoord3D
  vec3 shadowMapTexCoord3D = shadowMapTexCoord.xyz/shadowMapTexCoord.w; //do perspective division
	//vec3 shadowMapTexCoord3D = vec3(0,0,0);

	//do texture space transformation (-1 to 1 -> 0 to 1)
	shadowMapTexCoord3D = vec3(0.5,0.5,0.5) + shadowMapTexCoord3D*0.5;
	//substract small amount from z to get rid of self shadowing (TRY: disable to see difference)
	shadowMapTexCoord3D.z -= 0.003;

  float shadowCoeff = 1.0; //set to 1 if no shadow!
	//TASK 2.4: look up depth in u_depthMap and set shadow coefficient (shadowCoeff) to 0 based on depth comparison
	/*float zShadowMap = texture2D(u_depthMap, shadowMapTexCoord3D.xy).r;
	if(shadowMapTexCoord3D.z > zShadowMap)
		shadowCoeff = 0.0;*/

  //EXTRA TASK: Improve shadow quality by sampling multiple shadow coefficients (a.k.a. PCF)
	// TODO implement shadowing (see lab 6...shadow node)
	float sumShadowCoeff = 0.0;
	for(float dx=-1.0; dx <= 1.0; dx++)
	{
		for(float dy=-1.0; dy <= 1.0; dy++)
		{
			float subShadowCoeff = 1.0; //set to 1 if no shadow!
			float zShadowMap = texture2D(u_depthMap, shadowMapTexCoord3D.xy+vec2(dx/u_shadowMapWidth,dy/u_shadowMapHeight)).r;
			if(shadowMapTexCoord3D.z > zShadowMap)
				subShadowCoeff = 0.0;

			sumShadowCoeff += subShadowCoeff;
		}
	}
	shadowCoeff = sumShadowCoeff/9.0;

  //TASK 2.5: apply shadow coefficient to diffuse and specular part
  return c_amb + spotlightCoeff * shadowCoeff * (c_diff + c_spec) + c_em;
	//return c_amb + c_diff + c_spec + c_em;
}

void main (void) {

  vec4 textureColor = vec4(0,0,0,1);
  if(u_enableObjectTexture)
  {
    textureColor = texture2D(u_tex,v_texCoord);
  }

	// apply spotlight
	// TODO spotlights aren't perfectly working, try spotlight closer to terrain, over terrain ridges (they aren't being illuminated for some reason - terrain normals?)
	// TODO make spotlight edges a little softer!
	for(int i = 0; i < MAX_LIGHTS; i++) {
		// first calculate the angle between: the vector from the light source to the point in space   AND   the direction of the light (i.e. the center of the cone)
		float lightToSurfaceAngle = degrees(acos(dot(normalize(v_lightToSurface[i]), normalize(u_light[i].coneDirection))));
		// then obviously if this angle is greater than the angle of the spotlight, it means that this point is not within the cone of the lightsource, and thus is not being illuminated (setting spotlight coeff to 0...calculating only ambient and emmitting part)
		if(lightToSurfaceAngle <= u_light[i].coneAngle){
			gl_FragColor += calculateSimplePointLight(u_light[i], u_material, v_lightVec[i], v_normalVec, v_eyeVec, textureColor, v_shadowMapTexCoord[i], 1.0);
		} else {
			gl_FragColor += calculateSimplePointLight(u_light[i], u_material, v_lightVec[i], v_normalVec, v_eyeVec, textureColor, v_shadowMapTexCoord[i], 0.0);
		}
	}
}
