import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class CureLight implements IAbility {
  private static instance: CureLight;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'Cure Light'
'CURE LIGHT' 'CURE SERIOUS' 'CURE CRITICAL' HEAL
'CURE LIGHT' 'CURE SERIOUS' 'CURE CRITICAL' HEAL
Syntax: cast 'cure light'    <character>
Syntax: cast 'cure serious'  <character>
Syntax: cast 'cure critical' <character>
Syntax: cast 'heal'          <character>
These spells cure damage on the target character. The higher-level spells
heal more damage.
(see 'help healer' for details on the heal command)
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (CureLight.instance === undefined) {
      CureLight.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): CureLight {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return CureLight.GetInstance() as T;
  }
}

export default CureLight;
