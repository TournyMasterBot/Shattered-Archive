import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class AlterSelf implements IAbility {
  private static instance: AlterSelf;

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
    this.name = "Alter Self";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
'ALTER SELF'
ALTER SELF

Syntax: cast 'alter self' <mob>

Alter self is useful for disguising yourself as a mob. When cast
successfully, you take on the appearance of the mob that you chose.  

Groups containing this spell: Alteration

SEE ALSO: ALTERATION, TRANSMUTER
`;

    if (AlterSelf.instance === undefined) {
      AlterSelf.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): AlterSelf {
    if (!AlterSelf.instance) {
      AlterSelf.instance = new AlterSelf();
    }
    return AlterSelf.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return AlterSelf.GetInstance() as T;
  }
}

export default AlterSelf;
