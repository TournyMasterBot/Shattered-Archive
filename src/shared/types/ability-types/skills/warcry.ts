import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Warcry implements IAbility {
  private static instance: Warcry;

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
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
WARCRY
Only powerful barbarians can master the warcry.  The warcry enables the
barbarians to focus their energy and thoughts on their ability to fight.  It
is a bit similar to the Berserk skill and the frenzy spell, but more
powerful than both in certain ways.  Technically speaking, more hit and
damage, but no extra saves against spells and your armor becomes even more
vulnerable.
`;
    this.manualDescription = "Warcry offers a small healing effect when used.";
  }

  // Method to get the single instance of the class
  public static GetInstance(): Warcry {
    if (!Warcry.instance) {
      Warcry.instance = new Warcry();
    }
    return Warcry.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Warcry.GetInstance() as T;
  }
}

export default Warcry;
