import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class AlterElements implements IAbility {
  private static instance: AlterElements;

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
    this.name = "Alter Elements";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
'ALTER ELEMENTS'
ALTER ELEMENTS

Syntax: cast 'alter elements'

Alter elements allows a skilled transmuter to turn silver into gold. No one
is quite sure what the conversion rate is between the two elements.  

Groups containing this spell: Alteration

SEE ALSO: ALTERATION, TRANSMUTER
`;

    if (AlterElements.instance === undefined) {
      AlterElements.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): AlterElements {
    if (!AlterElements.instance) {
      AlterElements.instance = new AlterElements();
    }
    return AlterElements.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return AlterElements.GetInstance() as T;
  }
}

export default AlterElements;
