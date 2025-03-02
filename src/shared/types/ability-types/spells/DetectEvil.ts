import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class DetectEvil implements IAbility {
  private static instance: DetectEvil;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'Detect Evil'
'DETECT EVIL'
'DETECT EVIL'
Syntax: cast 'detect evil'
This spell enables the caster to detect evil characters, which will
reveal a characteristic red aura.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (DetectEvil.instance === undefined) {
      DetectEvil.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): DetectEvil {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return DetectEvil.GetInstance() as T;
  }
}

export default DetectEvil;
