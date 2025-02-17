// #region imports
import BattleragerBasics from "@shared/types/ability-types/groups-class/battlerager-basics";
import BattleragerDefault from "@shared/types/ability-types/groups-class/battlerager-default";

import { MortalClass } from "@shared/types/character-types/class-type";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import DslArmorType from "@shared/types/item-types/armor-type";

import { IDslClass } from "@shared/types/character-types/dslClass";
import { IMortalClass, IClassType } from "@shared/types/character-types/class-type";
import IRace from "@shared/types/character-types/race-interface";
import AffilitionAllegiance from "@shared/types/affiliation-types/affiliation-allegiance";
import Affiliation from "@shared/types/affiliation-types/affiliation-interface";
import HillDwarf from "../race-types/hill-dwarf";
import MountainDwarf from "../race-types/mountain-dwarf";
import AffiliationTypes from "../affiliation-types/affiliation-type";
// #endregion

export class Battlerager implements IDslClass, IMortalClass, IClassType {
  private static instance: Battlerager;

  id: string;
  name: string;
  displayName: string;
  isMortalClass: boolean;
  isReclass: boolean;
  isCsr: boolean;
  baseClass: IClassType;
  classType: IClassType;
  imgUrl: string;
  imgCreditUrl: string;
  primaryAttribute: IStatAttribute;
  secondaryAttribute: IStatAttribute;
  armorType: DslArmorType;
  classGroup: string;
  raceRestrictions: IRace[];
  affiliation: Affiliation;
  abilities: Map<number, any>;
  characterCreationAbilityGroups: Map<number, any>;
  characterCreationSkills: Map<number, any>;
  baseCpModifier: number;
  cpRacialModifiers: Map<IRace, number>;
  helpfile: string;
  castsAtLevel: boolean;
  castingLevelModifier: number;
  notes?: string;
  buffActions?: any[];

  constructor() {
    this.id = MortalClass.Battlerager.id;
    this.name = MortalClass.Battlerager.name;
    this.displayName = MortalClass.Battlerager.displayName;
    this.isMortalClass = true;
    this.isReclass = true;
    this.isCsr = true;
    this.baseClass = MortalClass.Battlerager;
    this.classType = MortalClass.Battlerager;
    this.imgUrl = "/img/classes/battlerager.png";
    this.imgCreditUrl = "https://www.pinterest.fr/pin/835558537094164810/";
    this.primaryAttribute = new StatAttribute({ type: StatAttributeType.Constitution });
    this.secondaryAttribute = new StatAttribute({ type: StatAttributeType.Strength });
    this.armorType = DslArmorType.Plate;
    this.classGroup = MortalClass.Warrior.toString();
    this.raceRestrictions = [];
    this.affiliation = {
      AffiliationType: AffiliationTypes.Clan | AffiliationTypes.Kingdom | AffiliationTypes.Race,
      AffiliationAllegiance: [AffilitionAllegiance.Wargar, AffilitionAllegiance.Thaxanos],
      AffiliationRaces: [HillDwarf.GetInstance(), MountainDwarf.GetInstance()],
    };

    this.abilities = new Map<number, any>();
    this.characterCreationAbilityGroups = new Map<number, any>([
      [0, [BattleragerBasics.GetInstance()]],
      [40, [BattleragerDefault.GetInstance()]],
    ]);
    this.characterCreationSkills = new Map<number, any>();

    this.baseCpModifier = 0;
    this.cpRacialModifiers = new Map<IRace, number>();

    this.helpfile = `help battlerager
Battleragers are a special reclass available only to dwarves who have learned
their special art from clan Wargar. They are very skilled warriors, with a 
preference for short handled weapons which allow them the control necessary
for multiple attacks in battle. Their major advantage is the ability to work
themselves into an extreme state of rage during battle. Perhaps it is the
adrenaline from this enraged state that gives them the ability to do so much
damage.
Who can be a Battlerager?
CLASS:     ANY
RACE:      HILL and MOUNTAIN DWARVES
ALIGNMENT: Any alignment
CLAN:      WARGAR only
see also: RECLASS BATTLERAGER WARGAR`;
    this.castsAtLevel = false;
    this.castingLevelModifier = 0;
    this.notes = "";
    this.buffActions = undefined;
  }

  public static GetInstance(): Battlerager {
    if (!Battlerager.instance) {
      Battlerager.instance = new Battlerager();
    }
    return Battlerager.instance;
  }

  public Get<T>(): T {
    return Battlerager.GetInstance() as unknown as T;
  }
}

export default Battlerager;
