import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class CauseCritical implements IAbility {
  private static instance: CauseCritical;

  name: string;
  helpFile: string;
  manualDescription?: string | undefined;
  duration?: number | undefined;
  effects?: SkillSpellEffects | undefined;
  group?: string | undefined;
  alternateKeyword?: string | undefined;
  recommendedHelpFileChanges?: string | undefined;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
help 'Cause Critical'
'CAUSE LIGHT' 'CAUSE SERIOUS' 'CAUSE CRITICAL' HARM
'CAUSE LIGHT' 'CAUSE SERIOUS' 'CAUSE CRITICAL' HARM
Syntax: cast 'cause light'    <victim>
Syntax: cast 'cause serious'  <victim>
Syntax: cast 'cause critical' <victim>
Syntax: cast harm             <victim>
These spells inflict damage on the victim.  The higher-level spells do
more damage.
`;

    if (CauseCritical.instance === undefined) {
      CauseCritical.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): CauseCritical {
    if (!CauseCritical.instance) {
      CauseCritical.instance = new CauseCritical();
    }
    return CauseCritical.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return CauseCritical.GetInstance() as T;
  }
}

export default CauseCritical;
