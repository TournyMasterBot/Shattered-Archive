import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class CauseSerious implements IAbility {
  private static instance: CauseSerious;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'cause serious'
'CAUSE LIGHT' 'CAUSE SERIOUS' 'CAUSE CRITICAL' HARM
'CAUSE LIGHT' 'CAUSE SERIOUS' 'CAUSE CRITICAL' HARM
Syntax: cast 'cause light'    <victim>
Syntax: cast 'cause serious'  <victim>
Syntax: cast 'cause critical' <victim>
Syntax: cast harm             <victim>
These spells inflict damage on the victim.  The higher-level spells do
more damage.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (CauseSerious.instance === undefined) {
      CauseSerious.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): CauseSerious {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return CauseSerious.GetInstance() as T;
  }
}

export default CauseSerious;
