import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class BurningHands implements IAbility {
  private static instance: BurningHands;

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
    this.name = "Burning Hands";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
help 'Burning Hands'
'BURNING HANDS'
'BURNING HANDS'

Syntax: cast 'burning hands' <target>

Adding to the growing list of spells which one learning the combat arts
shall receive, burning hands helps to broaden the knowledge offered by the
lesser spell of chill touch.  This spell as well, offers a slightly
increased potential for damage than that of chill touch.  

See also - COMBAT
`;

    if (BurningHands.instance === undefined) {
      BurningHands.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): BurningHands {
    if (!BurningHands.instance) {
      BurningHands.instance = new BurningHands();
    }
    return BurningHands.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return BurningHands.GetInstance() as T;
  }
}

export default BurningHands;
