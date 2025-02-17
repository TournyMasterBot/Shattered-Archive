import AffiliationTypes from "@shared/types/affiliation-types/affiliation-type";
import AffiliationGods from "@shared/types/affiliation-types/affiliation-gods";
import AffilitionAllegiance from "@shared/types/affiliation-types/affiliation-allegiance";
import IRace from "@shared/types/character-types/race-interface";
import IDslClass from "@shared/types/character-types/dslClass";

interface Affiliation {
    AffiliationType: AffiliationTypes;
    AffiliationGods?: AffiliationGods[];
    AffiliationAllegiance?: AffilitionAllegiance[];
    AffiliationRaces?: IRace[];
    AffiliationClasses?: IDslClass[];
}

export default Affiliation;