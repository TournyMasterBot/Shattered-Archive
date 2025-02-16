import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Nightmare implements IAbility {
  private static instance: Nightmare;

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
    this.name = "Nightmare";
    this.abilityGroupType = AbilityGroupType.Songs;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
Nightmare - A melancholy tune with unnerving undertones, this song 
can strike fear into the hearts of their foe, causing them to run away.
`;
    this.manualDescription = "This is the skald's version of spook";

    if (Nightmare.instance === undefined) {
      Nightmare.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Nightmare {
    if (!Nightmare.instance) {
      Nightmare.instance = new Nightmare();
    }
    return Nightmare.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Nightmare.GetInstance() as T;
  }
}

export default Nightmare;
