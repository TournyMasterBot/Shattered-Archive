import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Age implements IAbility {
  private static instance: Age;

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
    this.abilityGroupType = AbilityGroupType.Specialty;
    this.abilityUsage = AbilityUsage.Passive;
    this.helpFile = `help age
AGE
AGE
Age on DSL is for roleplaying purposes only and has no visable game
affect.  Different Races have different life spans so ages vary.  To
increase your age, go to the trainer and type ""Practice age"".  You can
increase your age but you can NEVER decrease it.  Practicing your age
DOES NOT cost ANY practices.
TABLE OF AGES:
Race      Teen      Young Adult   Adult     Middle Aged   Old
Human     17-19     20-29         30-45     46-60         61-85
Goblin    17-19     20-29         30-45     46-60         61-85
Dwarf     40-60     61-120        121-250   251-350       350+
Elf       40-90     91-175        176-300   301-500       501+
Ogre      30-80     81-110        111-180   181-210       211-250
Minotaur  30-60     61-80         81-115    116-145       146-175
Gnome     35-85     86-110        111-190   191-220       221-240
Dragon    107-300   300-700       700-1.5k  1.5k-3k       3k-5k
Kender    20-29     30-55         56-88     89-131        131-160
Yinn      20-30     31-50         51-70     71-90         91-110`;
    if (Age.instance === undefined) {
      Age.instance = this;
    }
  }
  // Method to get the single instance of the class
  public static GetInstance(): Age {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Age.GetInstance() as T;
  }
}

export default Age;
