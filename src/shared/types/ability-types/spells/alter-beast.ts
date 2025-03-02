import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class AlterBeast implements IAbility {
  private static instance: AlterBeast;

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
ALTER BEAST

Syntax: cast 'alter beast'

This spell requires the battlemage having charmed and controlled one of many
kinds of weak animals found around Algoron. The casting of this spell will
then transform the creature into a charmed gnarth for the battlemage's use. 
There are many different gnarth creations, each one unique to the race of
the animal used.  

Groups containing this spell: Battlemagic

SEE ALSO:  BATTLEMAGE, BATTLEMAGIC

Updated 03.19.2021
`;

    if (AlterBeast.instance === undefined) {
      AlterBeast.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): AlterBeast {
    if (!AlterBeast.instance) {
      AlterBeast.instance = new AlterBeast();
    }
    return AlterBeast.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return AlterBeast.GetInstance() as T;
  }
}

export default AlterBeast;
