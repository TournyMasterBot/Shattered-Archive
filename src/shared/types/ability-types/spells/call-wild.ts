import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class CallWild implements IAbility {
  private static instance: CallWild;

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
help 'Call Wild'
'CALL WILD'
'CALL WILD'

Syntax:  cast 'call wild' bear
         cast 'call wild' wolf
         cast 'call wild' wolverine
         cast 'call wild' cougar
         cast 'call wild' panther

This spell, available only to rangers and druids, enables them to call
wild animals to their aid.  Once these creatures have served their
purpose, they may be dismissed.

See also - NATURE RANGER DRUID DISMISS
`;
    this.manualDescription = `
Most people agree that bear is the best summon.

Wild Bear
Creature: a wild bear Race: bear
a wild bear appears to be a more neutral soul.
Their wealth appears to be 0 gold and 0 silver
They appear to be female.
The base health of this creature is 1176.
The base magically ability of this creature is 103.
This creature is upon the cycle of training '35'
This creature does 3d7 damage in a pound manner.
The creature has the following characteristics:
Offensive Tactics:bash berserk disarm dodge fast rescue crush
Immunities: summon charm
Resistances: blunt cold
Vulnerabilities: fire mental
This creature is affected by charm dark vision

Wild Wolf
Creature: a wild wolf Race: wolf
a wild wolf appears to be a more neutral soul.
Their wealth appears to be 0 gold and 0 silver
They appear to be male.
The base health of this creature is 724.
The base magically ability of this creature is 0.
This creature is upon the cycle of training '35'
This creature does 3d7 damage in a pound manner.
The creature has the following characteristics:
Offensive Tactics:berserk dodge fast
Immunities: summon charm
This creature is affected by charm dark vision

Wild Wolverine
Creature: a wild wolverine Race: wolf
a wild wolverine appears to be a more neutral soul.
Their wealth appears to be 0 gold and 0 silver
They appear to be male.
The base health of this creature is 814.
The base magically ability of this creature is 0.
This creature is upon the cycle of training '35'
This creature does 3d7 damage in a slash manner.
The creature has the following characteristics:
Offensive Tactics:dodge fast
Immunities: charm
This creature is affected by charm dark vision

Wild Cougar
Creature: a wild cougar Race: cat
a wild cougar appears to be a more neutral soul.
Their wealth appears to be 0 gold and 0 silver
They appear to be none.
The base health of this creature is 1086.
The base magically ability of this creature is 0.
This creature is upon the cycle of training '35'
This creature does 3d7 damage in a pierce manner.
The creature has the following characteristics:
Offensive Tactics:dodge fast
Immunities: charm
This creature is affected by charm dark vision

Wild Panther
Creature: a wild panther Race: cat
a wild panther appears to be a more neutral soul.
Their wealth appears to be 0 gold and 0 silver
They appear to be female.
The base health of this creature is 996.
The base magically ability of this creature is 0.
This creature is upon the cycle of training '35'
This creature does 3d7 damage in a slash manner.
The creature has the following characteristics:
Offensive Tactics:dodge fast
Immunities: charm
This creature is affected by charm dark vision
`;

    if (CallWild.instance === undefined) {
      CallWild.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): CallWild {
    if (!CallWild.instance) {
      CallWild.instance = new CallWild();
    }
    return CallWild.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return CallWild.GetInstance() as T;
  }
}

export default CallWild;
