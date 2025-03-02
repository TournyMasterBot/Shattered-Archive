import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class ContinualLight implements IAbility {
  private static instance: ContinualLight;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help Continual Light
'CONTINUAL LIGHT'
CONTINUAL LIGHT

Syntax: cast 'continual light'
        cast 'continual light' <object>

This spell creates a ball of light, which you can hold as a light source. 
The ball of light will last indefinitely. It may also be used on an object
to give it an enchanted glow.  

See also - CREATION 
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (ContinualLight.instance === undefined) {
      ContinualLight.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): ContinualLight {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ContinualLight.GetInstance() as T;
  }
}

export default ContinualLight;
