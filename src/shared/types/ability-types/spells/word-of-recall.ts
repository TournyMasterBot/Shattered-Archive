import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class WordOfRecall implements IAbility {
  private static instance: WordOfRecall;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `help 'Word of Recall'
'WORD OF RECALL'
'WORD OF RECALL'
Syntax: cast 'word of recall'
This spell duplicates the built-in RECALL ability. It is provided solely for
Merc-based muds which wish to eliminate the built-in ability while still
providing the spell. This spell circumvents the pkill no-recall lag.`;
    this.abilityGroupType = AbilityGroupType.Unknown; // Adjust if necessary
    this.abilityUsage = AbilityUsage.Active;

    if (WordOfRecall.instance === undefined) {
      WordOfRecall.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): WordOfRecall {
    if (!WordOfRecall.instance) {
      WordOfRecall.instance = new WordOfRecall();
    }
    return WordOfRecall.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return WordOfRecall.GetInstance() as T;
  }
}

export default WordOfRecall;
